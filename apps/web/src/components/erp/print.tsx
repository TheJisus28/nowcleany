import { Printer } from 'lucide-react';

/** Company heading that only appears on paper (documents, consultations and reports). */
export function PrintHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4 hidden items-center justify-between border-b border-ink pb-3 print:flex">
      <div className="flex items-center gap-3">
        <img src="/brand/nowcleany-mark.png" alt="" className="size-10" />
        <div>
          <p className="text-[15px] font-bold">NOW CLEANY S.A.S.</p>
          <p className="text-[11px]">Montería, Córdoba</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-[15px] font-semibold">{title}</p>
        {subtitle ? <p className="text-[11px]">{subtitle}</p> : null}
        <p className="text-[11px]">Impreso el {new Date().toLocaleString('es-CO')}</p>
      </div>
    </div>
  );
}

export function printScreen(): void {
  window.print();
}

export const PrintIcon = Printer;
