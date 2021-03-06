const router = require("express").Router();
const { Fact } = require("../db/models");

module.exports = router;

// /api/facts
router.get("/", (req, res, next) => {
  Fact.findAll()
    .then(facts => res.json(facts))
    .catch(next);
});
