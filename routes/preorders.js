const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const { getPreOrdersByDate } = require('../controllers/preorders');
router.get('/', protect, authorize('admin'), getPreOrdersByDate);
module.exports = router;
