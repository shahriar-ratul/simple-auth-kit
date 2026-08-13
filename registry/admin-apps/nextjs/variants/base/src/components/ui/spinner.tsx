import { Loader2Icon } from "lucide-react";

import { cn } from "@/lib/utils";

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
	size?: number;
	variant?: "climbing" | "rotating-square" | "hourglass";
	color?: string;
}

function Spinner({ className, size = 15, color, ...props }: SpinnerProps) {
	return (
		<div
			className={cn("inline-flex items-center justify-center", className)}
			role="status"
			aria-label="Loading"
			{...props}
		>
			<Loader2Icon
				className="animate-spin"
				style={{ width: size * 2, height: size * 2, color: color ?? "var(--primary)" }}
			/>
		</div>
	);
}

export { Spinner };
