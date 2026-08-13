"use client";

import { observer } from "mobx-react-lite";
import { useRouter } from "next/navigation";
import { KeyRoundIcon, LogOutIcon, UserIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/lib/stores/store-context";

function initialsOf(label: string): string {
  return (
    label
      .split(/[@.\s]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

/** Top-right profile dropdown, alongside `NavUser` in the sidebar footer — the reference app's `Header`/`UserMenu` puts this in the top bar, not just the sidebar. */
export const UserMenu = observer(function UserMenu() {
  const store = useAuthStore();
  const router = useRouter();

  const label = store.currentUser?.displayName || store.currentUser?.email || store.currentUser?.sub || "Account";
  const photo = store.currentUser?.photo ?? null;

  async function handleLogOut() {
    await store.logout();
    router.push("/login");
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Avatar className="size-8 cursor-pointer">
          {photo && <AvatarImage src={photo} alt="" className="object-cover" />}
          <AvatarFallback>{initialsOf(label)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => router.push("/account")}>
            <UserIcon />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/account/change-password")}>
            <KeyRoundIcon />
            Change password
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => void handleLogOut()}>
          <LogOutIcon />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
