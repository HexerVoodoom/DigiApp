// Hand-written declarations so src tests can exercise the KV merge behavior
// (allowJs is off in tsconfig).
interface PagesContext {
  request: Request;
  env: {
    PUSH_SUBSCRIPTIONS: {
      get(key: string): Promise<string | null>;
      put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
      delete(key: string): Promise<void>;
    };
  };
}

export function onRequestOptions(): Response | Promise<Response>;
export function onRequestPost(ctx: PagesContext): Promise<Response>;
export function onRequestDelete(ctx: PagesContext): Promise<Response>;
