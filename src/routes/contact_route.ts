import { Router } from 'express';
import { ContactController } from '../controllers/contact_controller';

const router = Router();

router.post('/send', ContactController.sendContactMessage);

export default router;
