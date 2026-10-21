import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.middleware";
import {
  listCollections,
  createCollection,
  getCollection,
  updateCollection,
  deleteCollection,
  updateMembers,
  listItems,
  saveItem,
  removeItem,
  checkSaved,
} from "../controllers/portfolio_collection_controller";

const router = Router();

router.use(authenticateToken);

router.get("/", listCollections);
router.post("/", createCollection);
router.get("/items", listItems);
router.post("/items", saveItem);
router.delete("/items/:itemId", removeItem);
router.get("/check-saved", checkSaved);
router.get("/:collectionId", getCollection);
router.patch("/:collectionId", updateCollection);
router.delete("/:collectionId", deleteCollection);
router.put("/:collectionId/members", updateMembers);

export default router;
