const router = require('express').Router();
const { getRestaurants, getRestaurant } = require('../controllers/restaurants');
const { protect } = require('../middleware/auth');
const { addReservation } = require('../controllers/reservations');
router.post('/:restaurantId/reservations', protect, addReservation);
router.get('/', getRestaurants);
router.get('/:id', getRestaurant);
module.exports = router;
