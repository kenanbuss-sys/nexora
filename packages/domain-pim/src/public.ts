/**
 * @nexora/domain-pim public application interface.
 */
export { CatalogService, type ProductView, type SkuView } from './catalog.service';
export { MerchandisingService, type CategoryView, type VariantPlan } from './merchandising.service';
export {
  SubstitutionService,
  type AlternativeView,
  type AvailabilityGate,
  type SubstitutionView,
} from './substitution.service';
