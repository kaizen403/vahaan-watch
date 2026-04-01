/**
 * CARMEN Video SDK
 *
 * @category    C++ Sample
 * @package     CARMEN Video C++ Sample
 *
 * @copyright   2024 Adaptive Recognition
 * @licence     https://adaptiverecognition.com/eula/
 *
 * This sample shows how you can set up a process with CARMEN Video SDK that
 * recognizes license plates (ANPR) and vehicle attributes (MMR) on a video stream with
 * Adaptive Recognition Cloud Vehicle API.
 * Only the most essential output field usages are shown in this example.
 */

#include <iostream>

#include "utils.hpp"

#include <carmen/AnprBuilder.hpp>
#include <carmen/MmrBuilder.hpp>
#include <carmen/AdaptiveRecognitionCloudBuilder.hpp>
#include <carmen/StreamProcessorBuilder.hpp>
#include <carmen/Logger.hpp>
#include <carmen/License.hpp>

void onEventCallback(const cm::Event& e) {
    try {
        std::cout << "------------------------------------------------------" << std::endl;
        std::cout << "Unix timestamp: " << e.timestamp() << " ms" << std::endl;

        //Plate
        std::cout << "Plate text: " << e.vehicle().plate().text() << std::endl;
        std::cout << "Country: " << e.vehicle().plate().country() << std::endl;

        //MMR
        std::cout << "Make: " << e.vehicle().attributes().make() << std::endl;
        std::cout << "Model: " << e.vehicle().attributes().model() << std::endl;
        std::cout << "Color: " << colorRGBIntToString(e.vehicle().attributes().color()) << std::endl;
        std::cout << "Category: " << e.vehicle().attributes().category() << std::endl;

        std::cout << std::endl;

    } catch(const std::exception& e) {
        std::cout << "Exception in event callback " << e.what() << std::endl;
    } catch(...) {
        std::cout << "Exception in event callback" << std::endl;
    }
}

int main(int argc, const char** argv) {
    try {
        if(argc < 4) {
            std::cout << "Usage: " << argv[0] << " <region code> <stream url / video file> <cloud api key>" << std::endl;

            //  Region code:
            //      See in Reference Manual: Region List
            //
            //  Stream url examples:
            //      "rtsp://username:password@192.168.1.2:8994"
            //      "http://192.168.1.2:9901/video.mjpeg"
            //  Video file example:
            //      "file:///C:\\video.mp4"

            return -1;
        }
        std::string region = argv[1];
        std::string streamUrl = argv[2];
        std::string apiKey = argv[3];

        cm::log::GlobalLogger::setMinLevel(cm::log::LogLevel::WARNING);

        std::cout << "Previous licensing type: " << static_cast<int>(cm::licensing::getCurrentLicensingType()) << std::endl;
        std::cout << "Setting CloudNNC (" << static_cast<int>(cm::LicensingType::CloudNNC) << ")  licensing..." << std::endl;
        cm::licensing::setCloudNNC(apiKey);
        std::cout << "Licensing type: " << static_cast<int>(cm::licensing::getCurrentLicensingType()) << std::endl;

        auto cloud = cm::cloud::AdaptiveRecognitionCloudBuilder()
                .apiKey(apiKey)
                        // you may need custom URL and API endpoint in case of CARMEN Worker:
                        //   https://carmencloud.com/docs/content/category/carmen-worker
//                .host("api.cloud.adaptiverecognition.com", 443)
//                .vehicleApiEndpoint("/vehicle")
                .build();

#ifdef CMV_ENABLE_EXPERIMENTAL_FEATURES
        auto supportedCountries = cloud.getCountries();
        for(const auto& cloudCountry : supportedCountries) {
            std::cout <<
                cloudCountry.region << " | " <<
                cloudCountry.location << " | " <<
                cloudCountry.country << " | " <<
                cloudCountry.state <<
                std::endl;
        }
#endif

        cm::video::StreamProcessor stream = cm::video::StreamProcessorBuilder()
                .source(streamUrl)
                .region(region)
                .name("Stream 1")
                .eventCallback(onEventCallback)
                .statusChangeCallback(commonStatusCallback)
                .cloud(cloud)
                .roi({{0.0,  0.0},
                      {0.95, 0.0},
                      {0.95, 0.95},
                      {0.0,  0.95}})
                .autoReconnect(true)
                .build();

        std::cout << "Please press 'q' then 'Enter' to stop stream processing." << std::endl;

        stream.start();

        while(std::cin.get() != 'q');

        stream.stop();
    } catch(const std::exception& e) {
        std::cout << e.what() << std::endl;
        return -1;
    }
    return 0;
}
