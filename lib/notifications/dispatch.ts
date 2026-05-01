/**
 * Extension point for web push / email. In-app rows are created by DB triggers
 * or server code; call this after insert if you add out-of-band channels.
 */
export type NotificationRecord = {
  userId: string;
  type: string;
  payload: Record<string, unknown>;
};

export async function dispatchExternalNotification(
  _record: NotificationRecord,
): Promise<void> {
  // v1: no-op. Future: Web Push (VAPID), Resend, etc.
}
