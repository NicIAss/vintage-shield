const cloudflareEnvironment =
  "data:text/javascript,export const env = Object.create(null);";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return {
      shortCircuit: true,
      url: cloudflareEnvironment,
    };
  }
  return nextResolve(specifier, context);
}
