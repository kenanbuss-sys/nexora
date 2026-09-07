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
  type AvailabilityFeedGate,
  type ConnectorAdapter,
  type ConnectorConfigGate,
  type ConnectorKind,
  type ConnectorView,
} from './connector.service';
