import Head from "next/head";
import "../styles/globals.css";

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <script src="https://cdn.tailwindcss.com"></script>
      </Head>
      <Component {...pageProps} />
    </>
  );
}
