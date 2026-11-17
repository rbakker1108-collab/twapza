import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { api, ApiError } from "../api/client";
import { App } from "../App";
import { VerifyEmailPage } from "../pages/AuthPages";
import { makeAccount } from "../test-fixtures";
import { AuthProvider } from "./AuthProvider";

afterEach(() => vi.restoreAllMocks());

function at(path: string, ui: React.ReactNode) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </AuthProvider>,
  );
}

describe("email confirmation", () => {
  it("confirms the address from the link in the email", async () => {
    vi.spyOn(api, "me").mockRejectedValue(new ApiError(401, "Please log in."));
    const verify = vi.spyOn(api, "verifyEmail").mockResolvedValue(makeAccount());
    at("/verify-email?token=abc", <Routes><Route path="/verify-email" element={<VerifyEmailPage />} /></Routes>);
    expect(await screen.findByRole("heading", { name: "Your email address is confirmed" })).toBeInTheDocument();
    expect(verify).toHaveBeenCalledWith("abc");
    expect(screen.getByRole("link", { name: "Add your first video" })).toHaveAttribute("href", "/app");
  });

  it("explains an expired link", async () => {
    vi.spyOn(api, "me").mockRejectedValue(new ApiError(401, "Please log in."));
    vi.spyOn(api, "verifyEmail").mockRejectedValue(new ApiError(400, "This confirmation link has expired or was already used."));
    at("/verify-email?token=old", <Routes><Route path="/verify-email" element={<VerifyEmailPage />} /></Routes>);
    expect(await screen.findByRole("heading", { name: "This link didn't work" })).toBeInTheDocument();
    expect(screen.getByText(/expired or was already used/)).toBeInTheDocument();
  });

  it("reminds unconfirmed accounts in the app and can send the email again", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "me").mockResolvedValue(makeAccount("free", { email_verified: false }));
    vi.spyOn(api, "config").mockResolvedValue({} as never);
    vi.spyOn(api, "listProjects").mockResolvedValue([]);
    const resend = vi.spyOn(api, "resendVerification").mockResolvedValue({ ok: true });
    at("/app", <App />);
    expect(await screen.findByText(/Confirm your email address to add videos\. We sent a link to ann@example\.com\./)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send the email again" }));
    await waitFor(() => expect(resend).toHaveBeenCalled());
    expect(await screen.findByText(/Sent! Check your inbox/)).toBeInTheDocument();
  });

  it("shows no reminder once the address is confirmed", async () => {
    vi.spyOn(api, "me").mockResolvedValue(makeAccount("free"));
    vi.spyOn(api, "config").mockResolvedValue({} as never);
    vi.spyOn(api, "listProjects").mockResolvedValue([]);
    at("/app", <App />);
    await screen.findByRole("link", { name: "Your account" });
    expect(screen.queryByText(/Confirm your email address/)).not.toBeInTheDocument();
  });
});
