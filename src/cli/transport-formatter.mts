interface TransportEvidence {
  transport?: "rest";
  /** Why REST is in use; present only with `transport`. */
  transportReason?: string;
  transportUnavailable?: Array<{ field: string; reason: string }>;
}

export function formatTransportEvidence(value: TransportEvidence): string[] {
  return [
    ...(value.transport
      ? [
          `**transport** \`${value.transport}\`${value.transportReason ? ` (${value.transportReason})` : ""}`,
        ]
      : []),
    ...(value.transportUnavailable?.length
      ? [
          "",
          "## Unavailable transport fields",
          "",
          ...value.transportUnavailable.map(({ field, reason }) => `- \`${field}\`: ${reason}`),
        ]
      : []),
  ];
}

/** The JSON counterpart of `formatTransportEvidence`: only the fields that carry information. */
export function projectTransportEvidence(value: TransportEvidence): TransportEvidence {
  return {
    ...(value.transport && { transport: value.transport }),
    ...(value.transportReason && { transportReason: value.transportReason }),
    ...(value.transportUnavailable?.length && { transportUnavailable: value.transportUnavailable }),
  };
}
