if (typeof google === "undefined") {
  // @ts-ignore
  window.google = {
    script: {
      run: {
        withSuccessHandler: (cb: any) => ({
          withFailureHandler: (cb: any) => ({
            createNeptyneToken: () => cb("token"),
            fetchOidcToken: () => cb("oidcToken"),
            showCodeEditor: () => cb(),
            showStreamlit: () => cb(),
            syncTyneMetadata: () => cb(),
          }),
        }),
      },
    } as any,
  };
}

const makeGSheetRequest =
  <T>(method: string) =>
  () => {
    return new Promise<T>((resolve, reject) => {
      google.script.run
        .withSuccessHandler((response: T) => resolve(response))
        .withFailureHandler((err: any) => reject(err))
        [method]();
    });
  };

export const fetchGSheetAuthTokenFromServer =
  makeGSheetRequest<string>("createNeptyneToken");
export const fetchOidcTokenFromServer = makeGSheetRequest<string>("fetchOidcToken");
export const openCodeEditor = makeGSheetRequest<void>("showCodeEditor");

export const showStreamlit = makeGSheetRequest<void>("showStreamlit");
export const syncTyneMetadata = makeGSheetRequest<void>("syncTyneMetadata");
