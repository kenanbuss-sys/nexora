/**
 * @nexora/domain-collab public application interface.
 */
export {
  CollaborationService,
  COLLAB_ENTITY_TYPES,
  PRIVATE_ENTITY_TYPES,
  type PrivateEntityType,
  type AttachmentView,
  type CollabEntityType,
  type CommentView,
  type MentionNotifier,
} from './collab.service';
export { SearchService, type SearchHit } from './search.service';
export { DevOcrAdapter, type OcrPort, type OcrResult } from './ocr';
