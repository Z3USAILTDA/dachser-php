import { useState, useEffect } from "react";
import { Control, FieldPath, FieldValues } from "react-hook-form";
import { format, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateInputFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  required?: boolean;
  disabled?: boolean;
  showSyncIcon?: boolean;
  disablePastDates?: boolean;
}

export function DateInputField<T extends FieldValues>({
  control,
  name,
  label,
  required = false,
  disabled = false,
  showSyncIcon = false,
  disablePastDates = false,
}: DateInputFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const [inputValue, setInputValue] = useState(
          field.value ? format(field.value, "dd/MM/yyyy") : ""
        );

        useEffect(() => {
          if (field.value) {
            setInputValue(format(field.value, "dd/MM/yyyy"));
          } else {
            setInputValue("");
          }
        }, [field.value]);

        const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          const value = e.target.value;
          const digits = value.replace(/\D/g, "");
          let masked = "";
          if (digits.length <= 2) masked = digits;
          else if (digits.length <= 4) masked = `${digits.slice(0, 2)}/${digits.slice(2)}`;
          else masked = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;

          setInputValue(masked);

          if (digits.length === 8) {
            const parsed = parse(masked, "dd/MM/yyyy", new Date());
            if (isValid(parsed)) {
              field.onChange(parsed);
            }
          } else if (digits.length === 0) {
            field.onChange(undefined);
          }
        };

        const handleBlur = () => {
          if (inputValue) {
            const parsed = parse(inputValue, "dd/MM/yyyy", new Date());
            if (!isValid(parsed)) {
              setInputValue(field.value ? format(field.value, "dd/MM/yyyy") : "");
            }
          }
        };

        const handleCalendarSelect = (date: Date | undefined) => {
          field.onChange(date);
          if (date) {
            setInputValue(format(date, "dd/MM/yyyy"));
          } else {
            setInputValue("");
          }
        };

        return (
          <FormItem>
            <FormLabel className="flex items-center gap-1.5 text-sm">
              {label} {required && <span className="text-destructive">*</span>}
              {showSyncIcon && <RefreshCw className="h-3 w-3 text-primary animate-spin" />}
            </FormLabel>
            <div className="flex gap-2">
              <FormControl>
                <Input
                  placeholder="DD/MM/AAAA"
                  className="flex-1 bg-background/50 border-border"
                  disabled={disabled}
                  value={inputValue}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                />
              </FormControl>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={disabled}
                    className="bg-background/50 border-border shrink-0"
                  >
                    <CalendarIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value}
                    onSelect={handleCalendarSelect}
                    locale={ptBR}
                    className="pointer-events-auto"
                    disabled={disablePastDates ? (date) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      return date < today;
                    } : undefined}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
