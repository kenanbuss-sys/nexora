/**
 * @nexora/domain-int public application interface.
 */
export {
  IntegrationService,
  fetchTransport,
  type DeliveryView,
  type SubscriptionHealth,
  type SubscriptionView,
  type WebhookTransport,
} from './integration.service';
export {
  ConnectorService,
  applyMapping,
  type MappingRule,
  noopAdapter,
  webhookAdapter,
  envSecretsAdapter,
  rateLimitedAdapter,
  type SecretsPort,
  type AccountingExportGate,
  type AvailabilityFeedGate,
  type MarketplaceOrderGate,
  type ConnectorAdapter,
  type ConnectorConfigGate,
  type ConnectorKind,
  type ConnectorView,
} from './connector.service';
export {
  ExtensionService,
  PACK_CATALOG,
  PLATFORM_EXTENSION_API,
  type ActionConnectorGate,
  type ExtensionConfigGate,
  type ExtensionManifest,
  type PermissionCatalogGate,
} from './extension.service';
