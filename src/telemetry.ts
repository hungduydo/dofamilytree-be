import type { BatchSpanProcessor, ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace';

type ExportCallback = Parameters<SpanExporter['export']>[1];

/**
 * OpenTelemetry tracing (OTLP). PHẢI được import ĐẦU TIÊN ở main.ts / vercel.ts —
 * trước cả instrument.ts — vì instrumentation vá http/express/nest lúc chúng
 * được require.
 *
 * Tắt mặc định: chỉ bật khi có OTEL_EXPORTER_OTLP_ENDPOINT (hoặc
 * OTEL_EXPORTER_OTLP_TRACES_ENDPOINT), hay OTEL_TRACES_EXPORTER=console để xem
 * span ngay trên terminal khi dev. OTEL_SDK_DISABLED=true tắt hẳn. Khi tắt,
 * không package OTel nào được nạp — cold start trên Vercel không tốn thêm gì.
 *
 * Cùng tồn tại với Sentry: Sentry v11 KHÔNG đăng ký tracer provider OTel
 * (enableOpenTelemetrySetup mặc định false), nên provider ở đây là provider
 * global duy nhất. Sentry vẫn lo báo lỗi 500; OTel cho trace để lần ra lỗi.
 *
 * Lỗi: span của handler Nest ghi exception + status ERROR (instrumentation
 * nestjs-core); span HTTP server mang status ERROR với response 5xx.
 *
 * Cấu hình còn lại theo biến OTEL_* chuẩn (OTEL_EXPORTER_OTLP_HEADERS cho API
 * key của backend, OTEL_TRACES_SAMPLER / _ARG để lấy mẫu, …).
 */

const env = process.env;

const exporterKind = (env.OTEL_TRACES_EXPORTER || '').trim().toLowerCase();
const enabled =
  env.OTEL_SDK_DISABLED !== 'true' &&
  exporterKind !== 'none' &&
  (exporterKind === 'console' ||
    !!env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    !!env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT);

let spanProcessor: BatchSpanProcessor | undefined;

function start(): void {
  // require trong hàm để khi tắt thì không nạp gì cả.
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { NodeSDK } = require('@opentelemetry/sdk-node') as typeof import('@opentelemetry/sdk-node');
  const { BatchSpanProcessor: Batch, ConsoleSpanExporter } =
    require('@opentelemetry/sdk-trace') as typeof import('@opentelemetry/sdk-trace');
  const { OTLPTraceExporter } =
    require('@opentelemetry/exporter-trace-otlp-proto') as typeof import('@opentelemetry/exporter-trace-otlp-proto');
  const { resourceFromAttributes } = require('@opentelemetry/resources') as typeof import('@opentelemetry/resources');
  const { HttpInstrumentation } =
    require('@opentelemetry/instrumentation-http') as typeof import('@opentelemetry/instrumentation-http');
  const { ExpressInstrumentation } =
    require('@opentelemetry/instrumentation-express') as typeof import('@opentelemetry/instrumentation-express');
  const { NestInstrumentation } =
    require('@opentelemetry/instrumentation-nestjs-core') as typeof import('@opentelemetry/instrumentation-nestjs-core');
  const { UndiciInstrumentation } =
    require('@opentelemetry/instrumentation-undici') as typeof import('@opentelemetry/instrumentation-undici');
  /* eslint-enable @typescript-eslint/no-var-requires */

  const exporter = exporterKind === 'console' ? new ConsoleSpanExporter() : new OTLPTraceExporter();
  spanProcessor = new Batch({ exporter: new ScrubbingExporter(exporter) });

  const sdk = new NodeSDK({
    serviceName: env.OTEL_SERVICE_NAME || 'family-be-v2',
    resource: resourceFromAttributes({
      'deployment.environment.name': env.VERCEL_ENV || env.NODE_ENV || 'development',
      ...(env.VERCEL_GIT_COMMIT_SHA ? { 'service.version': env.VERCEL_GIT_COMMIT_SHA } : {}),
      ...(env.VERCEL_REGION ? { 'cloud.region': env.VERCEL_REGION } : {}),
    }),
    spanProcessors: [spanProcessor],
    // Chọn tay thay vì auto-instrumentations-node: gói đó kéo hàng chục
    // instrumentation không dùng tới, làm cold start chậm.
    instrumentations: [
      new HttpInstrumentation({
        // Không trace request rác (health check của Swagger UI, favicon).
        ignoreIncomingRequestHook: (req) => /^\/(favicon\.ico|docs)/.test(req.url || ''),
      }),
      new ExpressInstrumentation(),
      new NestInstrumentation(),
      // fetch toàn cục (Upstash Redis/QStash, Supabase, Resend) đi qua undici.
      new UndiciInstrumentation(),
    ],
    // Không thu metrics/logs qua OTel — chỉ trace.
    metricReaders: [],
    logRecordProcessors: [],
  });
  sdk.start();
}

/**
 * Đẩy span đang chờ ra exporter. Trên Vercel function có thể bị đóng băng ngay
 * khi response ghi xong — gọi qua runInBackground() để giữ function sống tới
 * khi xong. No-op khi OTel tắt.
 */
export async function flushTelemetry(): Promise<void> {
  if (!spanProcessor) return;
  // Chờ một vòng event loop: span HTTP server kết thúc bằng listener 'finish'
  // đăng ký SAU listener của vercel.ts, flush ngay thì span gốc bị bỏ sót.
  await new Promise((resolve) => setImmediate(resolve));
  await spanProcessor.forceFlush();
}

/** Thuộc tính span có thể chứa query string (token tắt nhắc ngày giỗ, chữ ký…). */
const URL_ATTRS = ['url.full', 'http.url', 'http.target', 'url.original'];
const DROP_ATTRS = ['url.query'];

/**
 * Gỡ query string khỏi span trước khi rời server — cùng nguyên tắc với
 * scrubEvent của Sentry: link tắt nhắc ngày giỗ mang `?token=`, URL presign
 * của S3/R2 mang chữ ký. Instrumentation http chỉ che theo danh sách tên
 * tham số cố định, không đủ; ở đây bỏ cả query cho chắc.
 */
export function scrubSpanAttributes(attributes: Record<string, unknown>): void {
  for (const key of DROP_ATTRS) delete attributes[key];
  for (const key of URL_ATTRS) {
    const v = attributes[key];
    if (typeof v === 'string' && v.includes('?')) attributes[key] = v.split('?')[0];
  }
}

class ScrubbingExporter implements SpanExporter {
  constructor(private readonly inner: SpanExporter) {}

  export(spans: ReadableSpan[], resultCallback: ExportCallback): void {
    for (const span of spans) scrubSpanAttributes(span.attributes as Record<string, unknown>);
    this.inner.export(spans, resultCallback);
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush?.() ?? Promise.resolve();
  }
}

// Cuối file: start() dùng ScrubbingExporter, class chưa khởi tạo nếu gọi sớm hơn.
if (enabled) start();
