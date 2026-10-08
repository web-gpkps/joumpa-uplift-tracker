import type { Metadata } from "next";
import { AuthFrame } from "@/components/shell/AuthFrame";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Masuk" };

export default function LoginPage() {
  return (
    <AuthFrame
      title="Masuk ke area pemilik"
      intro={
        <p>
          Area pemilik berisi workbook semua stasiun (Dashboard, Master SDM, Log Performa, Cek BMI,
          Tindak Lanjut, Penggantian SDM, Laporan Mingguan) serta tautan stasiun, Parameter, dan
          sinkronisasi Google Sheet.
        </p>
      }
      footnote={
        <p>
          Stasiun dan KPS tidak perlu masuk: buka tautan ruang kerja yang dibagikan pemilik
          aplikasi. Tautan hilang atau tidak bisa dibuka? Minta tautan baru kepada pemilik aplikasi.
        </p>
      }
    >
      <LoginForm />
    </AuthFrame>
  );
}
