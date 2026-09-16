export async function api(path, body) {
  let response;
  try {
    response = await fetch("/api/" + path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
    });
  } catch {
    throw Error(
      "Connection lost or login expired. Keep this page open to retain unsaved work; sign in in another tab, then retry. For generation, check request history before retrying.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw Error("Sign in again in another tab, then retry.");
  }
  if (!response.ok) throw Error(result.error || "The request failed.");
  return result;
}
export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function download(data, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
