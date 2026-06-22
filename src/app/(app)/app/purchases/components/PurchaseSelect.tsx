"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, ChevronDownIcon } from "@/components/icons";

export type PurchaseSelectOption<T extends string = string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
};

type PurchaseSelectProps<T extends string> = {
  value: T;
  options: Array<PurchaseSelectOption<T>>;
  onValueChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
  ariaLabel?: string;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
};

export function PurchaseSelect<T extends string>({
  value,
  options,
  onValueChange,
  placeholder = "Seleccionar",
  disabled = false,
  compact = false,
  ariaLabel,
  className = "",
  buttonClassName = "",
  menuClassName = "",
}: PurchaseSelectProps<T>) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const [activeIndex, setActiveIndex] = useState(
    selectedIndex >= 0 ? selectedIndex : 0,
  );

  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;
  const enabledOptions = useMemo(
    () => options.map((option, index) => ({ option, index })).filter((item) => !item.option.disabled),
    [options],
  );
  const defaultActiveIndex =
    selectedIndex >= 0 ? selectedIndex : enabledOptions[0]?.index ?? 0;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const openMenu = () => {
    setActiveIndex(defaultActiveIndex);
    setOpen(true);
  };

  const moveActive = (direction: 1 | -1) => {
    if (!enabledOptions.length) return;
    const currentEnabledIndex = enabledOptions.findIndex(
      (item) => item.index === activeIndex,
    );
    const nextEnabledIndex =
      currentEnabledIndex === -1
        ? direction === 1
          ? 0
          : enabledOptions.length - 1
        : (currentEnabledIndex + direction + enabledOptions.length) %
          enabledOptions.length;
    setActiveIndex(enabledOptions[nextEnabledIndex]?.index ?? activeIndex);
  };

  const selectOption = (option: PurchaseSelectOption<T>) => {
    if (option.disabled) return;
    onValueChange(option.value);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        className={`input flex w-full min-w-0 items-center justify-between gap-2 text-left ${
          compact ? "min-h-9 py-1.5 text-xs" : "min-h-10"
        } ${buttonClassName}`}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        onClick={() => {
          if (disabled) return;
          if (open) {
            setOpen(false);
          } else {
            openMenu();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) {
              openMenu();
              return;
            }
            moveActive(1);
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              openMenu();
              return;
            }
            moveActive(-1);
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!open) {
              openMenu();
              return;
            }
            const option = options[activeIndex];
            if (option) selectOption(option);
          }
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      >
        <span className={`min-w-0 truncate ${selectedOption ? "" : "text-zinc-500"}`}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDownIcon
          className={`size-4 shrink-0 text-zinc-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            id={`${id}-options`}
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className={`absolute left-0 right-0 z-[160] mt-2 max-h-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-[0_18px_32px_-22px_rgba(39,39,42,0.55)] ${menuClassName}`}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                    isSelected || isActive
                      ? "bg-sky-50 text-sky-950"
                      : "text-zinc-700 hover:bg-zinc-50"
                  } ${option.disabled ? "cursor-not-allowed opacity-50" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectOption(option)}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  {isSelected ? <CheckIcon className="size-4 shrink-0" /> : null}
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
