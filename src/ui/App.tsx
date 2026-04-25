import { Canvas } from "../render/Canvas.tsx";
import { ordersDocument } from "../domain/__fixtures__/orders.ts";

export function App(): React.ReactElement {
  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-900">
      <header className="flex items-baseline gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <span className="text-base font-semibold tracking-tight">Archik</span>
        <span className="text-xs text-slate-500">{ordersDocument.name}</span>
      </header>
      <main className="min-h-0 flex-1 p-6">
        <div className="h-full w-full rounded-lg border border-slate-200 bg-white shadow-sm">
          <Canvas
            document={ordersDocument}
            className="h-full w-full"
          />
        </div>
      </main>
    </div>
  );
}
