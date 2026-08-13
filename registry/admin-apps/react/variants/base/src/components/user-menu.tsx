import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router-dom";
import { KeyRoundIcon, LogOutIcon, UserIcon } from "lucide-react";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/stores/store-context";

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
  const navigate = useNavigate();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const label = store.currentUser?.displayName || store.currentUser?.email || store.currentUser?.sub || "Account";
  const photo = store.currentUser?.photo ?? null;

  async function handleLogOut() {
    await store.logout();
    navigate("/login", { replace: true });
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Avatar className="size-8 cursor-pointer">
            {photo && <AvatarImage src={photo} alt="" className="object-cover" />}
            <AvatarFallback>{initialsOf(label)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => navigate("/account")}>
              <UserIcon />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setChangePasswordOpen(true)}>
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
      <ChangePasswordDialog open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
    </>
  );
});
