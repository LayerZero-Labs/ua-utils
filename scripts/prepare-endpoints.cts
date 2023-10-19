import { mkdirSync, opendirSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import assert from "assert";

main();

/**
 * Pulls the endpoint addresses from the upstream package
 * without pulling the whole package into the bundled code
 */
async function main() {
  // First we'll resolve the path to the @layerzerolabs/lz-evm-sdk-v1 package
  //
  // Instead of resolving the path to the module name itself, i.e.
  // `require.resolve("@layerzerolabs/lz-evm-sdk-v1")` we need to pinpoint
  // a specific file in the root of the package.
  //
  // This is because resolving the module name would result in a path to the main entrypoint
  // which could be nested in arbitrary directory under the package. We though want the package
  // root since we know the deployments folder is in the package root.
  const endpointDeploymentsPackagePath = require.resolve(
    "@layerzerolabs/lz-evm-sdk-v1/package.json"
  );

  // Now that we have the path to package.json, we can easily construct the path
  // to the deployments folder
  const deploymentsFolderPath = resolve(
    dirname(endpointDeploymentsPackagePath),
    "deployments"
  );

  // We'll accumulate the endpoint addresses in this object
  const endpointAddresses: Record<string, string> = {};

  // Now we'll iterate over the contents of the deployments folder
  for await (const deploymentFolderName of opendirSync(deploymentsFolderPath)) {
    const networkName = deploymentFolderName.name;
    const endpointDeploymentFilePath = join(
      deploymentsFolderPath,
      networkName,
      "Endpoint.json"
    );

    try {
      // We'll load up the Endpoint deployment file and get the address from it
      const deployment = require(endpointDeploymentFilePath);
      const address = deployment.address;

      assert(!!address, `Missing endpoint address`);

      endpointAddresses[networkName] = address;
    } catch (error) {
      console.warn(
        `Problem getting endpoint address for ${networkName}: ${error}`
      );
    }
  }

  // The final step is to serialize the findings
  // and store them in the generated folder
  const outputFilePath = resolve(
    __dirname,
    "..",
    "generated",
    "endpoints.json"
  );
  const output = JSON.stringify(endpointAddresses, null, "\t");

  mkdirSync(dirname(outputFilePath), { recursive: true });
  writeFileSync(outputFilePath, output);
}
