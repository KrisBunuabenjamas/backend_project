const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const { getMenuItem, updateMenuItem, deactivateMenuItem } = require('../controllers/menu');
router.use(protect);
router.route('/:id').get(getMenuItem).put(authorize('admin'), updateMenuItem);
router.patch('/:id/deactivate', authorize('admin'), deactivateMenuItem);
module.exports = router;
