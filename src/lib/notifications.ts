/** What the notifications API returns (shared by the account page and its tests). */
export type NotificationItem = {
  id: string;
  kind: "order.placed" | "order.paid" | "order.shipped" | "order.cancelled";
  title: string;
  body: string;
  link: string;
  createdAt: string;
  read: boolean;
};

export type NotificationList = { unreadCount: number; items: NotificationItem[] };
