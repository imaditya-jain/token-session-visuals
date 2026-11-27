import "server-only";

import { Campaign } from "@/server/db/models/campaign";
import { Category, MediaAsset, MediaFolder, Post, Tag } from "@/server/db/models/blog";
import { AuditLog } from "@/server/db/models/audit-log";
import { AuthToken } from "@/server/db/models/auth-token";
import { InventoryAdjustment } from "@/server/db/models/inventory-adjustment";
import { Enquiry } from "@/server/db/models/enquiry";
import { EmailJob } from "@/server/db/models/email-job";
import { Notification } from "@/server/db/models/notification";
import { Job } from "@/server/db/models/job";
import { OtpChallenge } from "@/server/db/models/otp-challenge";
import { RateLimit } from "@/server/db/models/rate-limit";
import { ShopifyCollection, ShopifyOrder, ShopifyProduct } from "@/server/db/models/shopify-mirror";
import { Reel, ReelComment, ReelLike, ReelReport } from "@/server/db/models/reel";
import { Role } from "@/server/db/models/role";
import { SiteSetting } from "@/server/db/models/site-setting";
import { Subscriber } from "@/server/db/models/subscriber";
import { PlantDiagnosis } from "@/server/db/models/plant-diagnosis";
import { PushDevice } from "@/server/db/models/push-device";
import { User } from "@/server/db/models/user";
import { Wishlist } from "@/server/db/models/wishlist";

/**
 * Creates any missing indexes (idempotent, never drops). Uniqueness of accounts and TTL cleanup of rate
 * limit counters depend on these, so they are guaranteed on first connection instead of relying on a manual step.
 * Add every new model here.
 */
export async function ensureIndexes(): Promise<void> {
  await Promise.all([
    User.createIndexes(),
    RateLimit.createIndexes(),
    AuthToken.createIndexes(),
    EmailJob.createIndexes(),
    Campaign.createIndexes(),
    Job.createIndexes(),
    Notification.createIndexes(),
    PushDevice.createIndexes(),
    PlantDiagnosis.createIndexes(),
    Wishlist.createIndexes(),
    Reel.createIndexes(),
    ReelComment.createIndexes(),
    ReelLike.createIndexes(),
    ReelReport.createIndexes(),
    Subscriber.createIndexes(),
    ShopifyProduct.createIndexes(),
    ShopifyCollection.createIndexes(),
    ShopifyOrder.createIndexes(),
    OtpChallenge.createIndexes(),
    Role.createIndexes(),
    AuditLog.createIndexes(),
    Category.createIndexes(),
    MediaFolder.createIndexes(),
    Tag.createIndexes(),
    Post.createIndexes(),
    MediaAsset.createIndexes(),
    SiteSetting.createIndexes(),
    Enquiry.createIndexes(),
    InventoryAdjustment.createIndexes(),
  ]);
}
