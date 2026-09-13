import express from 'express';
import * as contentController from '../controllers/content.controller.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', contentController.listContent);
router.post('/', authenticate, authorize('researcher', 'comms_officer', 'admin'), contentController.createContent);
router.patch('/:id/status', authenticate, authorize('comms_officer', 'admin'), contentController.updateContentStatus);
router.patch('/:id', authenticate, authorize('comms_officer', 'admin'), contentController.updateContent);
router.get('/:id', optionalAuth, contentController.getContentById);

export default router;
