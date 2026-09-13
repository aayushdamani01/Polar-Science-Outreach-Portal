import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';

// GET /api/content?type=report&status=published&search=glacier&expedition_id=...
export const listContent = async (req, res) => {
  const { type, status, search, expedition_id } = req.query;

  try {
    // Full-text search still needs raw SQL (Prisma has no tsvector support)
        if (search) {
      const typeFilter = type ? Prisma.sql`AND type = ${type}::"ContentType"` : Prisma.empty;
      const rows = await prisma.$queryRaw`
        SELECT id, expedition_id, type, title, description, file_url, thumbnail_url,
               file_size_bytes, mime_type, status, uploaded_by, approved_by,
               view_count, download_count, created_at, updated_at, datasetMeta
        FROM content_items
        WHERE search_vector @@ plainto_tsquery('english', ${search})
          AND status = ${status || 'published'}::"ContentStatus"
          ${typeFilter}
        ORDER BY created_at DESC
      `;
      return res.json(rows);
    }

    const items = await prisma.contentItem.findMany({
      where: {
        status: status || 'published',
        ...(type && { type }),
        ...(expedition_id && { expeditionId: expedition_id }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        expedition: true,
        uploader: { select: { id: true, name: true, email: true, organization: true } },
        approver: { select: { id: true, name: true, organization: true } },
        tags: { include: { tag: true } },
      },
    });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/content — create new content item.
// admin / comms_officer uploads are trusted and go straight to 'published'
// (self-approved). Everyone else (researchers) lands in 'in_review' so it's
// visibly queued for a comms_officer/admin to publish, instead of silently
// sitting as an untouched 'draft' forever.
export const createContent = async (req, res) => {
  const {
    expedition_id,
    type,
    title,
    description,
    body,
    summary,
    file_url,
    thumbnail_url,
    mime_type,
    file_size_bytes,
    datasetMeta,
    client_request_id,
    // Archive module (Phase 6) metadata — all optional so this stays
    // backwards compatible with every existing caller (UploadPage etc.)
    // that doesn't send any of these.
    region,
    research_domain,
    authors,
    source,
    year,
    keywords,
  } = req.body;
  try {
    // Phase 4: a retry after a lost response must return the original item,
    // not create a second ContentItem. Scope the lookup to its owner.
    if (client_request_id) {
      const existing = await prisma.contentItem.findUnique({
        where: { clientRequestId: client_request_id },
      });
      if (existing && existing.uploadedBy === req.user.id) {
        return res.status(200).json(existing);
      }
    }

    const isTrusted = ['admin', 'comms_officer'].includes(req.user.role);

    // Archive year defaults to the linked expedition's start year (so old
    // material archived against a past expedition lands on the right point
    // of the Year Timeline without the uploader typing it in), then falls
    // back to the current year.
    let archiveYear = year ? parseInt(year, 10) : undefined;
    if (!archiveYear && expedition_id) {
      const expedition = await prisma.expedition.findUnique({
        where: { id: expedition_id },
        select: { startDate: true, region: true },
      });
      if (expedition?.startDate) archiveYear = new Date(expedition.startDate).getFullYear();
      if (!region && expedition?.region) req.body.region = expedition.region; // fall through to below
    }
    if (!archiveYear) archiveYear = new Date().getFullYear();

    const keywordNames = Array.isArray(keywords)
      ? keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean)
      : typeof keywords === 'string'
        ? keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean)
        : [];

    const item = await prisma.contentItem.create({
      data: {
        expeditionId: expedition_id,
        type,
        title,
        description,
        body,
        summary,
        fileUrl: file_url,
        thumbnailUrl: thumbnail_url,
        mimeType: mime_type,
        fileSizeBytes: file_size_bytes,
        datasetMeta: datasetMeta || undefined,
        clientRequestId: client_request_id || null,
        uploadedBy: req.user.id,
        status: isTrusted ? 'published' : 'in_review',
        approvedBy: isTrusted ? req.user.id : undefined,
        region: region || req.body.region || undefined,
        researchDomain: research_domain || undefined,
        authors: authors || undefined,
        source: source || undefined,
        year: archiveYear,
        ...(keywordNames.length && {
          tags: {
            create: keywordNames.map((name) => ({
              tag: { connectOrCreate: { where: { name }, create: { name } } },
            })),
          },
        }),
      },
      include: { expedition: true, tags: { include: { tag: true } } },
    });
    res.status(201).json(item);
  } catch (err) {
    if (err.code === 'P2002' && client_request_id) {
      const existing = await prisma.contentItem.findUnique({
        where: { clientRequestId: client_request_id },
      });
      if (existing && existing.uploadedBy === req.user.id) {
        return res.status(200).json(existing);
      }
    }
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/content/:id/status — move through draft -> in_review -> published
export const updateContentStatus = async (req, res) => {
  const { status } = req.body; // 'in_review' | 'published' | 'archived'
  try {
    const item = await prisma.contentItem.update({
      where: { id: req.params.id },
      data: { status, approvedBy: req.user.id },
    });
    res.json(item);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: err.message });
  }
};


// PATCH /api/content/:id — comms_officer/admin can edit the full archive
// metadata and written content attached to an expedition. File replacement
// remains handled by the upload flow; this endpoint edits the record itself.
export const updateContent = async (req, res) => {
  try {
    const existing = await prisma.contentItem.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const {
      type, title, description, body, summary, region, research_domain,
      authors, source, year, keywords, thumbnail_url,
    } = req.body;

    if (title !== undefined && !String(title).trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const keywordNames = Array.isArray(keywords)
      ? keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean)
      : typeof keywords === 'string'
        ? keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean)
        : null;

    const data = {};
    if (type !== undefined) data.type = type;
    if (title !== undefined) data.title = String(title).trim();
    if (description !== undefined) data.description = description ? String(description).trim() : null;
    if (body !== undefined) data.body = body || null;
    if (summary !== undefined) data.summary = summary ? String(summary).trim() : null;
    if (region !== undefined) data.region = region || null;
    if (research_domain !== undefined) data.researchDomain = research_domain || null;
    if (authors !== undefined) data.authors = authors ? String(authors).trim() : null;
    if (source !== undefined) data.source = source ? String(source).trim() : null;
    if (thumbnail_url !== undefined) data.thumbnailUrl = thumbnail_url || null;
    if (year !== undefined) {
      if (year === '' || year === null) data.year = null;
      else {
        const parsedYear = Number.parseInt(year, 10);
        if (!Number.isInteger(parsedYear) || parsedYear < 1800 || parsedYear > 2200) {
          return res.status(400).json({ error: 'Archive year is invalid' });
        }
        data.year = parsedYear;
      }
    }
    if (keywordNames !== null) {
      data.tags = {
        deleteMany: {},
        ...(keywordNames.length ? {
          create: keywordNames.map((name) => ({
            tag: { connectOrCreate: { where: { name }, create: { name } } },
          })),
        } : {}),
      };
    }

    const item = await prisma.contentItem.update({
      where: { id: req.params.id },
      data,
      include: {
        expedition: true,
        uploader: { select: { id: true, name: true, organization: true } },
        approver: { select: { id: true, name: true, organization: true } },
        tags: { include: { tag: true } },
      },
    });
    res.json(item);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: err.message });
  }
};

// GET /api/content/:id
// Public callers only ever see published items. Uploaders, comms_officers,
// and admins can also view their own / any non-published item (drafts,
// in_review, archived) — everyone else gets a 404 (not 403, so we don't
// confirm the id exists at all).
export const getContentById = async (req, res) => {
  try {
    const item = await prisma.contentItem.findUnique({
      where: { id: req.params.id },
      include: { expedition: true, tags: { include: { tag: true } }, aiGenerations: true },
    });
    if (!item) return res.status(404).json({ error: 'Not found' });

    const isStaff = req.user && ['admin', 'comms_officer'].includes(req.user.role);
    const isOwner = req.user && req.user.id === item.uploadedBy;

    if (item.status !== 'published' && !isStaff && !isOwner) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Only bump the view count for items that are actually publicly visible,
    // so drafts/in_review being previewed by staff don't rack up fake views.
    if (item.status === 'published') {
      const updated = await prisma.contentItem.update({
        where: { id: req.params.id },
        data: { viewCount: { increment: 1 } },
      });
      item.viewCount = updated.viewCount;
    }

    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
