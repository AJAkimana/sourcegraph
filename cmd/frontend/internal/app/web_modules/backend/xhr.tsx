import "whatwg-fetch";

let token: string | null = null;
export function useAccessToken(tok: string): void {
	token = tok;
}

interface FetchOptions {
	headers: Headers;
	credentials: string;
}

export function combineHeaders(a: Headers, b: Headers): Headers {
	const headers = new Headers(a);
	b.forEach((val: string, name: any) => { headers.append(name, val); });
	return headers;
}

function defaultOptions(): FetchOptions | undefined {
	if (typeof Headers === "undefined") {
		return; // for unit tests
	}
	const headers = new Headers();
	// headers.set("Authorization", `session ${token}`);
	return {
		headers,
		// we only need to include cookies when running in-page
		// the chrome extension uses the Authorization field
		credentials: "include",
	};
}

export function doFetch(url: string, opt?: any): Promise<Response> {
	const defaults = defaultOptions();
	const fetchOptions = { ...defaults, ...opt };
	if (opt && opt.headers && defaults) {
		// the above object merge might override the auth headers. add those back in.
		fetchOptions.headers = combineHeaders(opt.headers, defaults.headers);
	}
	return fetch(url, fetchOptions);
}
