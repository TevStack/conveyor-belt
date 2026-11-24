import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata = {
  title: "Conveyor Belt · Local Eyes",
  description: "Where every Solution Factory initiative is up to, and who has the next step.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-GB" className={montserrat.variable}>
      <body>{children}</body>
    </html>
  );
}
