// BOLT #9: Assigned Feature Flags
// Extracted from https://github.com/lightning/bolts/blob/master/09-features.md

// Feature bits are numbered from the least-significant bit, at bit 0.
// Even bits are mandatory, odd bits are optional.

// Feature bit constants
export const OPTION_DATA_LOSS_PROTECT_MANDATORY = 0
export const OPTION_DATA_LOSS_PROTECT_OPTIONAL = 1

export const OPTION_UPFRONT_SHUTDOWN_SCRIPT_MANDATORY = 4
export const OPTION_UPFRONT_SHUTDOWN_SCRIPT_OPTIONAL = 5

export const GOSSIP_QUERIES_MANDATORY = 6
export const GOSSIP_QUERIES_OPTIONAL = 7

export const VAR_ONION_OPTIN_MANDATORY = 8
export const VAR_ONION_OPTIN_OPTIONAL = 9

export const GOSSIP_QUERIES_EX_MANDATORY = 10
export const GOSSIP_QUERIES_EX_OPTIONAL = 11

export const OPTION_STATIC_REMOTEKEY_MANDATORY = 12
export const OPTION_STATIC_REMOTEKEY_OPTIONAL = 13

export const PAYMENT_SECRET_MANDATORY = 14
export const PAYMENT_SECRET_OPTIONAL = 15

export const BASIC_MPP_MANDATORY = 16
export const BASIC_MPP_OPTIONAL = 17

export const OPTION_SUPPORT_LARGE_CHANNEL_MANDATORY = 18
export const OPTION_SUPPORT_LARGE_CHANNEL_OPTIONAL = 19

export const OPTION_ANCHORS_MANDATORY = 22
export const OPTION_ANCHORS_OPTIONAL = 23

export const OPTION_ROUTE_BLINDING_MANDATORY = 24
export const OPTION_ROUTE_BLINDING_OPTIONAL = 25

export const OPTION_SHUTDOWN_ANYSEGWIT_MANDATORY = 26
export const OPTION_SHUTDOWN_ANYSEGWIT_OPTIONAL = 27

export const OPTION_DUAL_FUND_MANDATORY = 28
export const OPTION_DUAL_FUND_OPTIONAL = 29

export const OPTION_QUIESCE_MANDATORY = 34
export const OPTION_QUIESCE_OPTIONAL = 35

export const OPTION_ATTRIBUTION_DATA_MANDATORY = 36
export const OPTION_ATTRIBUTION_DATA_OPTIONAL = 37

export const OPTION_ONION_MESSAGES_MANDATORY = 38
export const OPTION_ONION_MESSAGES_OPTIONAL = 39

export const OPTION_PROVIDE_STORAGE_MANDATORY = 42
export const OPTION_PROVIDE_STORAGE_OPTIONAL = 43

export const OPTION_CHANNEL_TYPE_MANDATORY = 44
export const OPTION_CHANNEL_TYPE_OPTIONAL = 45

export const OPTION_SCID_ALIAS_MANDATORY = 46
export const OPTION_SCID_ALIAS_OPTIONAL = 47

export const OPTION_PAYMENT_METADATA_MANDATORY = 48
export const OPTION_PAYMENT_METADATA_OPTIONAL = 49

export const OPTION_ZEROCONF_MANDATORY = 50
export const OPTION_ZEROCONF_OPTIONAL = 51

export const OPTION_SIMPLE_CLOSE_MANDATORY = 60
export const OPTION_SIMPLE_CLOSE_OPTIONAL = 61

// Type for feature vector (bitfield)
export type FeatureVector = Uint8Array

// Enum for feature contexts (where features are presented)
export enum FeatureContext {
  INIT = 'I', // init message
  NODE_ANNOUNCEMENT = 'N', // node_announcement
  CHANNEL_ANNOUNCEMENT = 'C', // channel_announcement
  CHANNEL_ANNOUNCEMENT_ODD = 'C-', // always odd (optional)
  CHANNEL_ANNOUNCEMENT_EVEN = 'C+', // always even (required)
  BOLT11_INVOICE = '9', // BOLT 11 invoices
  BLINDED_PATH = 'B', // allowed_features in blinded path
  CHANNEL_TYPE = 'T', // channel_type field
}

// Note: Some features are ASSUMED to be present and can be ignored.
// Dependencies are listed in BOLT #9, but not extracted here as they are feature-specific.
