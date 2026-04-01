/**
 * CARMEN Video SDK
 *
 * @category    C++ Sample
 * @package     CARMEN Video C++ Sample
 *
 * @copyright   2024 Adaptive Recognition
 * @licence     https://adaptiverecognition.com/eula/
 *
 *
 * This sample shows how you can set up a process with CARMEN Video SDK that
 * uses the custom source / image stream feature.
 * This example implements a custom source that reads images from a directory.
 */

#include <filesystem>
#include <iostream>

#include <carmen/AnprBuilder.hpp>
#include <carmen/StreamProcessorBuilder.hpp>
#include <carmen/CustomImageStream.hpp>

#include "../common/utils.hpp"

#include "custom_stream.h"


void onEventCallback(const cm::Event& event) {
    std::cout << "------------------------------------------------------" << std::endl;
    std::cout << "Plate text: " << event.vehicle().plate().text() << std::endl;
    std::cout << "Country: " << event.vehicle().plate().country() << std::endl;

    std::cout << std::endl;
}


int main(int argc, char** argv) {
    try {
        if(argc < 3) {
            std::cout << "Usage: " << argv[0] << " <region code> <image dir path>" << std::endl;
            //  Region code:
            //      See in Reference Manual: Region List
            return -1;
        }

        std::string region = argv[1];
        std::string imageDir = argv[2];

        cm::anpr::Anpr anpr = cm::anpr::AnprBuilder()
                .type(cm::anpr::AnprBuilder::Type::LOCAL) // use LOCAL_GO for CARMEN_GO engines
                .build();

        cm::video::StreamProcessor stream = cm::video::StreamProcessorBuilder()
                .source(std::make_unique<MyStreamFactory>(imageDir))
                .region(region)
                .name("Stream 1")
                .eventCallback(onEventCallback)
                .anpr(anpr)
                .statusChangeCallback(commonStatusCallback) // may be omitted, the example only uses it for showing status changes
                .processingMode(cm::video::StreamProcessorMode::NonLiveStream)
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
