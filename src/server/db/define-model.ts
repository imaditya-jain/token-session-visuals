import "server-only";

import { type Model, model, models, type Schema } from "mongoose";

/**
 * Registers a model once. Next.js hot reload and warm serverless instances re-evaluate modules, and
 * Mongoose throws if a model name is registered twice.
 */
export function defineModel<T>(name: string, schema: Schema<T>): Model<T> {
  return (models[name] as unknown as Model<T> | undefined) ?? model<T>(name, schema);
}
