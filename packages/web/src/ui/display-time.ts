// Display only: UTC instants remain authoritative. No election zone or clock correction is inferred.
import { formatDeadline, type DeadlineText } from '../i18n/datetime.ts';
import type { Translator } from '../i18n/index.ts';

interface DisplayZones {
  displayZone?: string;
  viewerZone?: string;
}

function formatInstant(instantIso: string, tr: Translator, zones: DisplayZones, seconds: boolean): string {
  const viewer = zones.viewerZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const display = zones.displayZone ?? viewer;
  const primary = formatDeadline(instantIso, display, viewer, tr.locale, { seconds });
  const label = (value: DeadlineText): string => tr.t('qv.election.deadline', {
    electionTime: value.electionTime, offset: value.offset, zone: value.zone,
  });
  const text = label(primary);
  if (primary.viewerTime === undefined) return text;
  const secondary = formatDeadline(instantIso, viewer, viewer, tr.locale, { seconds });
  return text + ' — ' + tr.t('qv.election.deadlineViewer', { viewerTime: label(secondary) });
}

/** With no independently selected display zone, show the actual local zone once. */
export function formatDisplayTime(instantIso: string, tr: Translator, zones: DisplayZones = {}): string {
  return formatInstant(instantIso, tr, zones, false);
}

/** Presentation of the verified receipt's signed seconds; an absent time is never replaced with epoch zero. */
export function formatReceiptTime(sequencedAt: number | undefined, tr: Translator, zones: DisplayZones = {}): string | undefined {
  if (sequencedAt === undefined || !Number.isSafeInteger(sequencedAt)) return undefined;
  const instant = new Date(sequencedAt * 1000);
  if (!Number.isFinite(instant.getTime())) return undefined;
  return formatInstant(instant.toISOString(), tr, zones, true);
}
