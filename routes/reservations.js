const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { getReservations, getReservation, updateReservation, deleteReservation } = require('../controllers/reservations');
router.use(protect);
router.get('/', getReservations);
router.route('/:id').get(getReservation).put(updateReservation).delete(deleteReservation);
module.exports = router;
