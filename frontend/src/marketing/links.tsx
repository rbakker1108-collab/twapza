/** Link and NavLink that keep visitors in their language on the website (/nl/pricing, …). */
import { forwardRef } from "react";
import {
  Link as RouterLink,
  NavLink as RouterNavLink,
  type LinkProps,
  type NavLinkProps,
} from "react-router-dom";

import { useI18n } from "../i18n";
import { localize } from "./locale";

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ to, ...props }, ref) {
  const { lang } = useI18n();
  return <RouterLink ref={ref} to={typeof to === "string" ? localize(to, lang) : to} {...props} />;
});

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink({ to, ...props }, ref) {
  const { lang } = useI18n();
  return <RouterNavLink ref={ref} to={typeof to === "string" ? localize(to, lang) : to} {...props} />;
});
