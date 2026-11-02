import { Router } from 'express';
import { workflowController } from '../controllers/workflow.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireExactRole } from '../middleware/rbac.middleware';

// Everything here is SWFS-staff work management — internal notes, tasks and
// saved searches never reach a client org.
const router = Router();
router.use(authenticate, requireExactRole('ADMIN'));

router.get('/staff', workflowController.listStaff);

router.get('/notes', workflowController.listNotes);
router.get('/notes/mentions', workflowController.listMentions);
router.post('/notes', workflowController.addNote);
router.delete('/notes/:id', workflowController.deleteNote);

router.get('/tasks', workflowController.listTasks);
router.get('/tasks/summary', workflowController.taskSummary);
router.post('/tasks', workflowController.createTask);
router.patch('/tasks/:id', workflowController.updateTask);
router.post('/tasks/:id/complete', workflowController.completeTask);
router.post('/tasks/:id/reopen', workflowController.reopenTask);
router.delete('/tasks/:id', workflowController.deleteTask);

router.get('/saved-searches', workflowController.listSavedSearches);
router.post('/saved-searches', workflowController.createSavedSearch);
router.delete('/saved-searches/:id', workflowController.deleteSavedSearch);

export default router;
