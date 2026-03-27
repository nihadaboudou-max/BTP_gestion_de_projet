import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

export const formatFCFA = (amount: number | undefined | null): string => {
  if (amount === undefined || amount === null) return "0 FCFA";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "XOF",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace("XOF", "FCFA");
};

export const formatDate = (dateString: string | undefined | null): string => {
  if (!dateString) return "-";
  try {
    const date = typeof dateString === "string" ? parseISO(dateString) : new Date(dateString);
    return format(date, "dd MMM yyyy", { locale: fr });
  } catch (e) {
    return dateString as string;
  }
};

export const formatDateTime = (dateString: string | undefined | null): string => {
  if (!dateString) return "-";
  try {
    const date = typeof dateString === "string" ? parseISO(dateString) : new Date(dateString);
    return format(date, "dd MMM yyyy à HH:mm", { locale: fr });
  } catch (e) {
    return dateString as string;
  }
};
