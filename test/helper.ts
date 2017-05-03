export function normalizePath(path) {
    return path.replace(/^C/, 'c');
}

export function promiseRetry({ promise, numberOfRetries = 10 }) {

    return new Promise((resolve, reject) => {

        let retries = 0;

        const exec = () => {
            promise
                .then((value) => resolve(value))
                .catch((err) => {
                    console.warn(`>>> retry (${retries})`);
                    if (retries < numberOfRetries) {
                        retries++;
                        return setTimeout(() => exec(), 200);
                    }
                    console.warn('retries exceeded');
                    reject(err);
                });
        };

        exec();
    });

}
