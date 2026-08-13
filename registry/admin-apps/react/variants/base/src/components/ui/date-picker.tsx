import { Button, buttonVariants } from "@/components/ui/button";
import type { CalendarProps } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { type Locale, enUS } from "date-fns/locale";
import {
	Calendar as CalendarIcon,
	ChevronLeft,
	ChevronRight,
} from "lucide-react";
import * as React from "react";
import { useImperativeHandle, useRef } from "react";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { DayPicker } from "react-day-picker";

function Calendar({
	className,
	classNames,
	showOutsideDays = true,
	startYear = 1900,
	endYear = 2025,
	...props
}: CalendarProps & { startYear?: number; endYear?: number }) {
	const MONTHS = React.useMemo(() => {
		let locale: Pick<Locale, "options" | "localize" | "formatLong"> = enUS;
		const { options, localize, formatLong } = props.locale || {};
		if (options && localize && formatLong) {
			locale = {
				options,
				localize,
				formatLong,
			};
		}
		return genMonths(locale);
	}, []);

	const YEARS = React.useMemo(() => genYears(startYear, endYear), []);
	const disableLeftNavigation = () => {
		const today = new Date();
		const startDate = new Date(today.getFullYear() - startYear, 0, 1);
		if (props.month) {
			return (
				props.month.getMonth() === startDate.getMonth() &&
				props.month.getFullYear() === startDate.getFullYear()
			);
		}
		return false;
	};
	const disableRightNavigation = () => {
		const today = new Date();
		const endDate = new Date(today.getFullYear() + endYear, 11, 31);
		if (props.month) {
			return (
				props.month.getMonth() === endDate.getMonth() &&
				props.month.getFullYear() === endDate.getFullYear()
			);
		}
		return false;
	};

	return (
		<DayPicker
			showOutsideDays={showOutsideDays}
			className={cn("p-3", className)}
			classNames={{
				months:
					"flex flex-col sm:flex-row space-y-4  sm:space-y-0 justify-center",
				month: "flex flex-col items-center space-y-4",
				month_caption: "flex justify-center pt-1 relative items-center",
				caption_label: "text-sm font-medium",
				nav: "space-x-1 flex items-center ",
				button_previous: cn(
					buttonVariants({ variant: "outline" }),
					"h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute left-5 top-5",
					disableLeftNavigation() && "pointer-events-none",
				),
				button_next: cn(
					buttonVariants({ variant: "outline" }),
					"h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute right-5 top-5",
					disableRightNavigation() && "pointer-events-none",
				),
				month_grid: "w-full border-collapse space-y-1",
				weekdays: cn("flex", props.showWeekNumber && "justify-end"),
				weekday:
					"text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
				week: "flex w-full mt-2",
				day: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20 rounded-1",
				day_button: cn(
					buttonVariants({ variant: "ghost" }),
					"h-9 w-9 p-0 font-normal aria-selected:opacity-100 rounded-l-md rounded-r-md",
				),
				range_end: "day-range-end",
				selected:
					"bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground rounded-l-md rounded-r-md",
				today: "bg-accent text-accent-foreground",
				outside:
					"day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
				disabled: "text-muted-foreground opacity-50",
				range_middle:
					"aria-selected:bg-accent aria-selected:text-accent-foreground",
				hidden: "invisible",
				...classNames,
			}}
			components={{
				Chevron: ({ ...props }) =>
					props.orientation === "left" ? (
						<ChevronLeft className="h-4 w-4" />
					) : (
						<ChevronRight className="h-4 w-4" />
					),
				MonthCaption: ({ calendarMonth }) => {
					return (
						<div className="inline-flex gap-2">
							<Select
								defaultValue={calendarMonth.date.getMonth().toString()}
								onValueChange={(value) => {
									const newDate = new Date(calendarMonth.date);
									newDate.setMonth(Number.parseInt(value, 10));
									props.onMonthChange?.(newDate);
								}}
							>
								<SelectTrigger className="w-fit gap-1 border-none p-0 focus:bg-accent focus:text-accent-foreground">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{MONTHS.map((month) => (
										<SelectItem
											key={month.value}
											value={month.value.toString()}
										>
											{month.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select
								defaultValue={calendarMonth.date.getFullYear().toString()}
								onValueChange={(value) => {
									const newDate = new Date(calendarMonth.date);
									newDate.setFullYear(Number.parseInt(value, 10));
									props.onMonthChange?.(newDate);
								}}
							>
								<SelectTrigger className="w-fit gap-1 border-none p-0 focus:bg-accent focus:text-accent-foreground">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{YEARS.map((year) => (
										<SelectItem key={year.value} value={year.value.toString()}>
											{year.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					);
				},
			}}
			{...props}
		/>
	);
}
Calendar.displayName = "Calendar";

function genMonths(
	locale: Pick<Locale, "options" | "localize" | "formatLong">,
) {
	return Array.from({ length: 12 }, (_, i) => ({
		value: i,
		label: format(new Date(2021, i), "MMMM", { locale }),
	}));
}

function genYears(startYear = 1900, endYear = 2025) {
	return Array.from({ length: endYear - startYear + 1 }, (_, i) => ({
		value: startYear + i,
		label: (startYear + i).toString(),
	}));
}

type DatePickerProps = {
	value?: Date;
	onChange?: (date: Date | undefined) => void;
	disabled?: boolean;
	placeholder?: string;
	/**
	 * The year range will be: `This year + yearRange` and `this year - yearRange`.
	 * Default is 50.
	 * */
	startYear?: number;
	endYear?: number;
	/**
	 * The format is derived from the `date-fns` documentation.
	 * @reference https://date-fns.org/v3.6.0/docs/format
	 **/
	displayFormat?: string;
	className?: string;
	/**
	 * Show the default month when popup the calendar. Default is the current Date().
	 **/
	defaultPopupValue?: Date;
} & Pick<
	CalendarProps,
	"locale" | "weekStartsOn" | "showWeekNumber" | "showOutsideDays"
>;

type DatePickerRef = {
	value?: Date;
} & Omit<HTMLButtonElement, "value">;

const DatePicker = React.forwardRef<Partial<DatePickerRef>, DatePickerProps>(
	(
		{
			locale = enUS,
			defaultPopupValue = new Date(),
			value,
			onChange,
			startYear = 1980,
			endYear = 2025,
			disabled = false,
			displayFormat = "PPP",
			placeholder = "Pick a date",
			className,
			...props
		},
		ref,
	) => {
		const [month, setMonth] = React.useState<Date>(value ?? defaultPopupValue);
		const buttonRef = useRef<HTMLButtonElement>(null);
		const displayDate = React.useMemo(() => value, [value]);

		// Add effect to update month when value changes
		React.useEffect(() => {
			if (value) {
				setMonth(value);
			}
		}, [value]);

		const handleSelect = (newDay: Date | undefined) => {
			if (!newDay) return;
			onChange?.(newDay);
			setMonth(newDay);
		};

		useImperativeHandle(
			ref,
			() => ({
				...buttonRef.current,
				value: displayDate,
			}),
			[displayDate],
		);

		let loc = enUS;
		const { options, localize, formatLong } = locale;
		if (options && localize && formatLong) {
			loc = {
				...enUS,
				options,
				localize,
				formatLong,
			};
		}

		return (
			<Popover>
				<PopoverTrigger asChild disabled={disabled}>
					<Button
						variant="outline"
						className={cn(
							"w-full justify-start text-left font-normal",
							!displayDate && "text-muted-foreground",
							className,
						)}
						ref={buttonRef}
					>
						<CalendarIcon className="mr-2 h-4 w-4" />
						{displayDate ? (
							format(displayDate, displayFormat, { locale: loc })
						) : (
							<span>{placeholder}</span>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0">
					<Calendar
						mode="single"
						selected={displayDate}
						month={month}
						onSelect={(newDate) => {
							if (newDate) {
								handleSelect(newDate);
							}
						}}
						onMonthChange={setMonth}
						startYear={startYear}
						endYear={endYear}
						locale={locale}
						{...props}
					/>
				</PopoverContent>
			</Popover>
		);
	},
);

DatePicker.displayName = "DatePicker";

export { DatePicker };
export type { DatePickerProps, DatePickerRef };
