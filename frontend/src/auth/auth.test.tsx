import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { api, ApiError } from "../api/client";
import { App } from "../App";
import { ExportOptions, DEFAULT_EXPORT } from "../components/ExportOptions";
import { PricingCards } from "../marketing/PricingCards";
import { AccountPage } from "../pages/AccountPage";
import { LoginPage, SignupPage } from "../pages/AuthPages";
import { makeAccount, makeProject } from "../test-fixtures";
import { AuthProvider } from "./AuthProvider";
import { RequireAuth } from "./RequireAuth";

const loggedOut = () => vi.spyOn(api, "me").mockRejectedValue(new ApiError(401, "Please log in."));

function renderAt(path: string, ui: React.ReactNode) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </AuthProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("accounts", () => {
  it("sends visitors who aren't logged in to the login page", async () => {
    loggedOut();
    renderAt(
      "/app",
      <Routes>
        <Route path="/app" element={<RequireAuth><p>secret</p></RequireAuth>} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
    );
    expect(await screen.findByRole("heading", { name: "Log in to Twapza" })).toBeInTheDocument();
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });

  it("logs in and goes back to where the visitor was", async () => {
    const user = userEvent.setup();
    loggedOut();
    const login = vi.spyOn(api, "login").mockResolvedValue(makeAccount());
    renderAt(
      "/login?next=%2Fprojects%2Fp1",
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/projects/:id" element={<p>project page</p>} />
      </Routes>,
    );
    await user.type(await screen.findByLabelText("Email address"), "ann@example.com");
    await user.type(screen.getByLabelText("Password"), "secret password");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("project page")).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith("ann@example.com", "secret password");
  });

  it("shows the server's message when logging in fails", async () => {
    const user = userEvent.setup();
    loggedOut();
    vi.spyOn(api, "login").mockRejectedValue(new ApiError(401, "That email and password don't match an account."));
    renderAt("/login", <Routes><Route path="/login" element={<LoginPage />} /></Routes>);
    await user.type(await screen.findByLabelText("Email address"), "ann@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong password");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("don't match");
  });

  it("signs up for a paid plan and continues to the checkout", async () => {
    const user = userEvent.setup();
    loggedOut();
    vi.spyOn(api, "signup").mockResolvedValue(makeAccount());
    const checkout = vi.spyOn(api, "checkout").mockResolvedValue({ url: "https://pay.example/checkout" });
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, assign } as Location);
    renderAt("/signup?plan=pro&period=monthly", <Routes><Route path="/signup" element={<SignupPage />} /></Routes>);
    await user.type(await screen.findByLabelText("Email address"), "ann@example.com");
    await user.type(screen.getByLabelText("Password"), "secret password");
    await user.click(screen.getByRole("button", { name: "Create account and continue to payment" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://pay.example/checkout"));
    expect(checkout).toHaveBeenCalledWith("pro", "monthly");
  });

  it("pricing buttons lead visitors to sign-up with the chosen plan", async () => {
    loggedOut();
    renderAt("/pricing", <PricingCards yearly={false} />);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Get Creator" })).toHaveAttribute("href", "/signup?plan=creator&period=monthly"),
    );
    expect(screen.getByRole("link", { name: "Start for free" })).toHaveAttribute("href", "/signup");
  });

  it("locks Creator options on the Free plan and mentions the watermark", async () => {
    vi.spyOn(api, "me").mockResolvedValue(makeAccount("free"));
    renderAt("/app", <ExportOptions project={makeProject()} value={{ ...DEFAULT_EXPORT, cut_pauses: true }} onChange={() => {}} />);
    await screen.findByText(/Made with Twapza/);
    expect(screen.getByRole("checkbox", { name: /Cut pauses/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Cut pauses/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Progress bar/ })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Upgrade" })).toHaveAttribute("href", "/account#plans");
  });

  it("shows plan, minutes and lets a paying user switch plans after confirming", async () => {
    const user = userEvent.setup();
    const creator = makeAccount("creator", {
      subscription: { plan: "creator", period: "yearly", status: "active", renews_at: "2027-05-20T09:00:00Z", ends_at: null },
    });
    vi.spyOn(api, "me").mockResolvedValue(creator);
    const pro = makeAccount("pro", { subscription: { ...creator.subscription!, plan: "pro" } });
    const change = vi.spyOn(api, "changePlan").mockResolvedValue(pro);
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAt("/account", <AccountPage />);
    expect(await screen.findByText("12 of 300 min")).toBeInTheDocument();
    expect(screen.getByText(/Renews on/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage subscription" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Switch to Pro" }));
    expect(confirm).toHaveBeenCalledWith("Switch to Pro now? The price difference is charged right away.");
    expect(change).not.toHaveBeenCalled(); // said no
    await user.click(screen.getByRole("button", { name: "Switch to Pro" }));
    await waitFor(() => expect(change).toHaveBeenCalledWith("pro", "yearly"));
    expect(await screen.findByText("1,200 minutes of video per month", { exact: false })).toBeInTheDocument();
  });

  it("the app shows the account badge once logged in", async () => {
    vi.spyOn(api, "me").mockResolvedValue(makeAccount("creator"));
    vi.spyOn(api, "config").mockResolvedValue({} as never);
    vi.spyOn(api, "listProjects").mockResolvedValue([]);
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/app"]}>
          <App />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByRole("link", { name: "Your account" })).toHaveTextContent("Creator");
  });
});
