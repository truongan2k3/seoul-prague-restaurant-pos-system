import { after } from "next/server";

/** Start immediately and retain the invocation until it finishes on Vercel.
 * Call only inside a route handler or server action, after the mutation succeeds. */
export function dispatchNotificationTask(task: () => Promise<unknown>): void {
  const pending = Promise.resolve().then(task).then(() => {}, () => {
    // Do not log guest content, push endpoints, or credentials.
    console.error("[notifications] delivery task failed");
  });
  after(() => pending);
}
