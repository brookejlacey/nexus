'use client';

import { clsx } from 'clsx';
import type { Loan } from '@/hooks/useWebSocket';

const statusColors: Record<string, string> = {
  active: 'text-green-400 bg-green-400/10',
  repaid: 'text-blue-400 bg-blue-400/10',
  defaulted: 'text-red-400 bg-red-400/10',
  liquidated: 'text-yellow-400 bg-yellow-400/10',
};

export function LoanTable({ loans }: { loans: Loan[] }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h2 className="text-lg font-bold mb-4 text-green-400">Loans</h2>

      {loans.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] italic">No loans issued yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--text-secondary)] text-xs uppercase border-b border-[var(--border)]">
                <th className="pb-2 text-left">ID</th>
                <th className="pb-2 text-left">Borrower</th>
                <th className="pb-2 text-right">Principal</th>
                <th className="pb-2 text-right">Rate</th>
                <th className="pb-2 text-right">Repaid</th>
                <th className="pb-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {loans.map((loan) => (
                <tr key={loan.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--bg-card-hover)]">
                  <td className="py-2 font-mono text-xs">{loan.id}</td>
                  <td className="py-2 capitalize">{loan.borrower}</td>
                  <td className="py-2 text-right font-mono">{loan.principal.toFixed(2)}</td>
                  <td className="py-2 text-right font-mono">{(loan.interestRate * 100).toFixed(1)}%</td>
                  <td className="py-2 text-right font-mono">{loan.repaidAmount.toFixed(2)}</td>
                  <td className="py-2 text-center">
                    <span className={clsx(
                      'px-2 py-0.5 rounded text-xs font-medium',
                      statusColors[loan.status] || 'text-gray-400',
                    )}>
                      {loan.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
