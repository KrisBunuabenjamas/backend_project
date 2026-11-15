const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { getReview, updateReview, deleteReview } = require('../controllers/reviews');
router.use(protect);
router.route('/:id').get(getReview).put(updateReview).delete(deleteReview);
module.exports = router;
