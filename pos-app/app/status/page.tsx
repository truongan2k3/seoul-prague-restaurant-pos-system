"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  changeBusinessOwnerPasswordAction,
  getBusinessOwnerInfoAction,
  getStatusAdminSessionAction,
  sendAdminPopupAction,
  sendAdminRefreshAction,
  statusAdminLoginAction,
  statusAdminLogoutAction,
} from "@/src/lib/status-admin-actions";
import {
  buildPresenceMap,
  isPageOnline,
  subscribeToPagePresence,
  type PagePresencePayload,
} from "@/lib/pos-page-presence";
import { PAGE_TARGET_LABELS, PAGE_TARGETS, type PageTarget } from "@/lib/page-routes";

export default function StatusAdminPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [loginUser, setLoginUser] = useState("admin");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  const [ownerUsername, setOwnerUsername] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [newBusinessPassword, setNewBusinessPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const [popupTitle, setPopupTitle] = useState("");
  const [popupMessage, setPopupMessage] = useState("");
  const [popupTargets, setPopupTargets] = useState<PageTarget[]>([...PAGE_TARGETS]);
  const [popupFeedback, setPopupFeedback] = useState<string | null>(null);
  const [popupSubmitting, setPopupSubmitting] = useState(false);
  const [refreshFeedback, setRefreshFeedback] = useState<string | null>(null);
  const [refreshSubmitting, setRefreshSubmitting] = useState<PageTarget | "all" | null>(null);

  const [presenceUpdates, setPresenceUpdates] = useState<Map<PageTarget, PagePresencePayload>>(
    () => new Map(),
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void getStatusAdminSessionAction().then((session) => {
      setAuthenticated(session != null);
    });
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    void getBusinessOwnerInfoAction().then((result) => {
      if (result.ok) {
        setOwnerUsername(result.username);
        setBusinessName(result.businessName);
      }
    });
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    return subscribeToPagePresence((payload) => {
      setPresenceUpdates((prev) => {
        const next = new Map(prev);
        next.set(payload.page, payload);
        return next;
      });
    });
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    const interval = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(interval);
  }, [authenticated]);

  const presenceStates = useMemo(
    () => buildPresenceMap(presenceUpdates, now),
    [presenceUpdates, now],
  );

  const onlineCount = presenceStates.filter((entry) => entry.online).length;

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginSubmitting(true);
    setLoginError(null);
    const result = await statusAdminLoginAction(loginUser, loginPass);
    setLoginSubmitting(false);
    if (result.ok) {
      setAuthenticated(true);
      setLoginPass("");
      return;
    }
    setLoginError("Sai tên đăng nhập hoặc mật khẩu.");
  };

  const handleLogout = async () => {
    await statusAdminLogoutAction();
    setAuthenticated(false);
    setLoginPass("");
  };

  const handleChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordSubmitting(true);
    setPasswordMessage(null);
    const result = await changeBusinessOwnerPasswordAction(newBusinessPassword);
    setPasswordSubmitting(false);
    if (result.ok) {
      setPasswordMessage(`Đã đổi mật khẩu quản lý doanh nghiệp (${result.username}).`);
      setNewBusinessPassword("");
      return;
    }
    if (result.error === "passwordTooShort") {
      setPasswordMessage("Mật khẩu không được để trống.");
      return;
    }
    setPasswordMessage("Không thể đổi mật khẩu. Vui lòng thử lại.");
  };

  const toggleTarget = (target: PageTarget) => {
    setPopupTargets((prev) =>
      prev.includes(target) ? prev.filter((item) => item !== target) : [...prev, target],
    );
  };

  const handleRefreshPages = async (targets: PageTarget[]) => {
    const key: PageTarget | "all" = targets.length === PAGE_TARGETS.length ? "all" : targets[0]!;
    setRefreshSubmitting(key);
    setRefreshFeedback(null);
    const result = await sendAdminRefreshAction({ targets });
    setRefreshSubmitting(null);
    if (result.ok) {
      setRefreshFeedback(
        targets.length === PAGE_TARGETS.length
          ? "Đã gửi lệnh tải lại tất cả các trang."
          : `Đã gửi lệnh tải lại ${PAGE_TARGET_LABELS[targets[0]!]}.`,
      );
      return;
    }
    setRefreshFeedback("Không thể gửi lệnh tải lại. Trang có thể đang offline.");
  };

  const handleSendPopup = async (event: FormEvent) => {
    event.preventDefault();
    setPopupSubmitting(true);
    setPopupFeedback(null);
    const result = await sendAdminPopupAction({
      title: popupTitle,
      message: popupMessage,
      targets: popupTargets,
    });
    setPopupSubmitting(false);
    if (result.ok) {
      setPopupFeedback("Đã gửi popup tới các trang đã chọn.");
      setPopupTitle("");
      setPopupMessage("");
      return;
    }
    if (result.error === "emptyMessage") {
      setPopupFeedback("Vui lòng nhập tiêu đề hoặc nội dung.");
      return;
    }
    if (result.error === "noTargets") {
      setPopupFeedback("Chọn ít nhất một trang.");
      return;
    }
    setPopupFeedback("Gửi thất bại. Vui lòng thử lại.");
  };

  const formatLastSeen = useCallback((lastSeenAt: string) => {
    if (!lastSeenAt) return "Chưa kết nối";
    if (isPageOnline(lastSeenAt, now)) return "Đang hoạt động";
    const diffSec = Math.round((now - new Date(lastSeenAt).getTime()) / 1000);
    if (diffSec < 120) return `Offline ${diffSec}s trước`;
    const diffMin = Math.round(diffSec / 60);
    return `Offline ${diffMin} phút trước`;
  }, [now]);

  if (authenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Đang tải…
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl">
          <h1 className="text-2xl font-bold text-white">Quản trị hệ thống</h1>
          <p className="mt-2 text-sm text-zinc-400">Đăng nhập để truy cập /status</p>
          <form onSubmit={(event) => void handleLogin(event)} className="mt-6 space-y-4">
            <label className="block text-sm">
              <span className="font-medium text-zinc-300">Tài khoản</span>
              <input
                value={loginUser}
                onChange={(event) => setLoginUser(event.target.value)}
                autoComplete="username"
                className="pos-input mt-1"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-300">Mật khẩu</span>
              <input
                type="password"
                value={loginPass}
                onChange={(event) => setLoginPass(event.target.value)}
                autoComplete="current-password"
                className="pos-input mt-1"
                required
              />
            </label>
            {loginError && (
              <p className="rounded-lg bg-red-950/50 px-3 py-2 text-sm text-red-300">{loginError}</p>
            )}
            <button
              type="submit"
              disabled={loginSubmitting}
              className="min-h-[48px] w-full rounded-xl bg-indigo-600 text-base font-bold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {loginSubmitting ? "Đang đăng nhập…" : "Đăng nhập"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Trạng thái hệ thống</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {onlineCount}/{presenceStates.length} trang đang hoạt động
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Đăng xuất
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={refreshSubmitting != null || onlineCount === 0}
            onClick={() => void handleRefreshPages([...PAGE_TARGETS])}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {refreshSubmitting === "all" ? "Đang gửi…" : "Tải lại tất cả trang"}
          </button>
          {refreshFeedback && (
            <p className="text-sm text-sky-300">{refreshFeedback}</p>
          )}
        </div>

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {presenceStates.map((entry) => (
            <div
              key={entry.page}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{PAGE_TARGET_LABELS[entry.page]}</h2>
                <span
                  className={`inline-flex h-2.5 w-2.5 rounded-full ${
                    entry.online ? "bg-emerald-400" : "bg-zinc-600"
                  }`}
                  aria-hidden
                />
              </div>
              <p className="mt-2 text-sm text-zinc-400">{formatLastSeen(entry.lastSeenAt)}</p>
              <p className="mt-1 text-xs text-zinc-500">/{entry.page === "main" ? "" : entry.page}</p>
              <button
                type="button"
                disabled={!entry.online || refreshSubmitting != null}
                onClick={() => void handleRefreshPages([entry.page])}
                className="mt-3 w-full rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {refreshSubmitting === entry.page ? "Đang gửi…" : "Tải lại trang này"}
              </button>
            </div>
          ))}
        </section>

        <div className="grid gap-8 lg:grid-cols-2">
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="text-lg font-semibold">Gửi popup tức thì</h2>
            <p className="mt-1 text-sm text-zinc-400">Popup hiển thị ngay trên các trang đã chọn.</p>
            <form onSubmit={(event) => void handleSendPopup(event)} className="mt-4 space-y-4">
              <label className="block text-sm">
                <span className="font-medium text-zinc-300">Tiêu đề</span>
                <input
                  value={popupTitle}
                  onChange={(event) => setPopupTitle(event.target.value)}
                  className="pos-input mt-1"
                  placeholder="Thông báo"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-zinc-300">Nội dung</span>
                <textarea
                  value={popupMessage}
                  onChange={(event) => setPopupMessage(event.target.value)}
                  className="pos-input mt-1 min-h-[100px]"
                  placeholder="Nội dung popup…"
                />
              </label>
              <fieldset>
                <legend className="text-sm font-medium text-zinc-300">Gửi tới trang</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PAGE_TARGETS.map((target) => (
                    <label
                      key={target}
                      className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${
                        popupTargets.includes(target)
                          ? "border-indigo-500 bg-indigo-950/50 text-indigo-200"
                          : "border-zinc-700 text-zinc-400"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={popupTargets.includes(target)}
                        onChange={() => toggleTarget(target)}
                      />
                      {PAGE_TARGET_LABELS[target]}
                    </label>
                  ))}
                </div>
              </fieldset>
              {popupFeedback && (
                <p className="rounded-lg bg-indigo-950/40 px-3 py-2 text-sm text-indigo-200">
                  {popupFeedback}
                </p>
              )}
              <button
                type="submit"
                disabled={popupSubmitting}
                className="min-h-[44px] w-full rounded-xl bg-indigo-600 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {popupSubmitting ? "Đang gửi…" : "Gửi popup"}
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="text-lg font-semibold">Đổi mật khẩu quản lý doanh nghiệp</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Tài khoản đăng nhập trang chính (doanh nghiệp).
            </p>
            {ownerUsername && (
              <p className="mt-3 text-sm text-zinc-300">
                Doanh nghiệp: <strong>{businessName}</strong>
                <br />
                Tài khoản: <strong>{ownerUsername}</strong>
              </p>
            )}
            <form onSubmit={(event) => void handleChangePassword(event)} className="mt-4 space-y-4">
              <label className="block text-sm">
                <span className="font-medium text-zinc-300">Mật khẩu mới</span>
                <input
                  type="password"
                  value={newBusinessPassword}
                  onChange={(event) => setNewBusinessPassword(event.target.value)}
                  autoComplete="new-password"
                  className="pos-input mt-1"
                  required
                />
              </label>
              {passwordMessage && (
                <p className="rounded-lg bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
                  {passwordMessage}
                </p>
              )}
              <button
                type="submit"
                disabled={passwordSubmitting}
                className="min-h-[44px] w-full rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {passwordSubmitting ? "Đang lưu…" : "Lưu mật khẩu mới"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
