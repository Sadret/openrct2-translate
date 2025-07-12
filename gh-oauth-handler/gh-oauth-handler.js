const CLIENT_ID = "Ov23ct0fDobJn5hdYuQ1";
const CLIENT_SECRET = "3b499a0a0135c4f2f4dab02c4dead335e5611485";

export default {
	async fetch(request) {
		const url = new URL(request.url);

		if (url.pathname === "/callback") {
			const code = url.searchParams.get("code");
			if (!code) return new Response("Missing code", { status: 400 });

			const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
				method: "POST",
				headers: {
					Accept: "application/json",
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					client_id: CLIENT_ID,
					client_secret: CLIENT_SECRET,
					code
				})
			});

			const tokenData = await tokenRes.json();

			if (tokenData.error) {
				return new Response(`OAuth error: ${tokenData.error_description}`, { status: 400 });
			}

			const returnTo = decodeURIComponent(url.searchParams.get("state") || "/");
			return Response.redirect(`${returnTo}${returnTo.includes('?') ? "&" : "?"}access_token=${encodeURIComponent(tokenData.access_token)}`, 302);
		}

		return new Response("Not Found", { status: 404 });
	}
};
