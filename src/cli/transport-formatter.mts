interface TransportEvidence {
  transport?: "rest";
  transportUnavailable?: Array<{ field: string; reason: string }>;
}

export function formatTransportEvidence(value: TransportEvidence): string[] {
  return [
    ...(value.transport ? [`**transport** \`${value.transport}\``] : []),
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
