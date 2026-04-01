/**
 * CARMEN Video SDK
 *
 * @category    C Sample
 * @package     CARMEN Video C Sample
 *
 * @copyright   2024 Adaptive Recognition
 * @licence     https://adaptiverecognition.com/eula/
 *
 *
 * This sample shows how you can set up a process with CARMEN Video SDK that
 * recognizes license plates (ANPR) and vehicle attributes (MMR) on a video stream with
 * Adaptive Recognition Cloud Vehicle API.
 * Only the most essential output field usages are shown in this example.
 */

#include <stdio.h>
#include <string.h>
#include <inttypes.h>

#include "utils.h"

#include <carmen/Event.h>
#include <carmen/StreamProcessorBuilder.h>
#include <carmen/AdaptiveRecognitionCloudBuilder.h>
#include <carmen/Logger.h>
#include <carmen/CmError.h>
#include <carmen/License.h>


void onEventCallback(CM_EVENT* e, void* userdata) {
    printf("------------------------------------------------------\n");
    printf("Unix timestamp: %" PRId64 " ms\n", e->timestamp);

    CM_VEHICLE* vehicle = e->vehicle;
    CM_PLATE* plate = vehicle->plate;

    //Plate
    printf("Plate text: %s\n", plate->text);
    printf("Country: %s\n", plate->country);

    //MMR
    printf("Make: %s\n", vehicle->mmrData->make);
    printf("Model: %s\n", vehicle->mmrData->model);
    printf("Color: ");
    printOptionalColorRGB(&vehicle->mmrData->color);
    printf("\n");
    printf("Category: %s\n", vehicle->mmrData->category);

    printf("\n");
    fflush(stdout);

    cm_event_free(e);
}

void onStatusChangeCallback(CM_STREAM_PROCESSOR handle, enum CM_StreamProcessorStatus status, void* userdata){
    commonStatusCallback(handle, status);
};

#ifdef CMV_ENABLE_EXPERIMENTAL_FEATURES
void enum_countries_callback(const CM_ARCLOUD_COUNTRY_RECORD* countryRecord, void* userdata) {
    printf("REGION|LOCATION|COUNTRY|STATE: %s | %s | %s | %s\n",
           countryRecord->region,
           countryRecord->location,
           countryRecord->country,
           countryRecord->state
           );
}
#endif

int main(int argc, char** argv) {

    if(argc < 4) {
        printf("Usage: %s <region code> <stream url / video file> <cloud api key>\n", argv[0]);

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

    const char* region = argv[1];
    const char* streamUrl = argv[2];
    const char* apiKey = argv[3];

    cm_logger_set_global_logger_min_level(CM_LOGGER_LEVEL_WARNING);

    enum CM_LICENSING_TYPE licensing_type = CM_LICENSING_TYPE_UNKNOWN;
    cm_get_current_licensing_type(&licensing_type);
    printf("Previous licensing type: %d\n", licensing_type);
    printf("Setting CloudNNC (%d) licensing...\n", CM_LICENSING_TYPE_CLOUD_NNC);

    cm_set_licensing_cloudnnc(apiKey);

    licensing_type = CM_LICENSING_TYPE_UNKNOWN;
    cm_get_current_licensing_type(&licensing_type);
    printf("Licensing type: %d\n", licensing_type);

    CM_STREAM_PROCESSOR_BUILDER builder;
    memset(&builder, 0, sizeof(builder));
    cm_streamprocessorbuilder_create(&builder);

    cm_streamprocessorbuilder_set_source(builder, streamUrl);
    cm_streamprocessorbuilder_set_region(builder, region);
    cm_streamprocessorbuilder_set_name(builder, "Stream 1");
    cm_streamprocessorbuilder_set_event_callback(builder, onEventCallback, NULL, NULL);
    cm_streamprocessorbuilder_set_status_change_callback(builder, onStatusChangeCallback, NULL, NULL);

    // CLOUD
    CM_ADAPTIVE_RECOGNITION_CLOUD_BUILDER cloud_builder;
    memset(&cloud_builder, 0, sizeof(cloud_builder));
    cm_adaptive_recognition_cloud_builder_create(&cloud_builder);

    cm_adaptive_recognition_cloud_builder_set_api_key(cloud_builder, apiKey);

    // you may need custom URL and API endpoint in case of CARMEN Worker:
    //   https://carmencloud.com/docs/content/category/carmen-worker
//    cm_adaptive_recognition_cloud_builder_set_host(cloud_builder, "api.cloud.adaptiverecognition.com", 443, true);
//    cm_adaptive_recognition_cloud_builder_set_vehicleapi_endpoint(cloud_builder, "/vehicle");

    CM_ADAPTIVE_RECOGNITION_CLOUD ar_cloud;
    cm_adaptive_recognition_cloud_builder_build(cloud_builder, &ar_cloud);
    cm_adaptive_recognition_cloud_builder_free(cloud_builder);

#ifdef CMV_ENABLE_EXPERIMENTAL_FEATURES
    cm_adaptive_recognition_cloud_enum_supported_countries(ar_cloud, enum_countries_callback, NULL);
#endif

    cm_streamprocessorbuilder_set_cloud(builder, ar_cloud);

    cm_streamprocessorbuilder_set_anpr_color_recognition(builder, CM_TRUE);
    cm_streamprocessorbuilder_set_mmr_color_recognition(builder, CM_TRUE);
    cm_streamprocessorbuilder_set_auto_reconnect(builder, CM_TRUE);

    CM_POINT points[] = {
            {0.0,  0.0},
            {0.95, 0.0},
            {0.95, 0.95},
            {0.0,  0.95}
    };
    cm_streamprocessorbuilder_set_roi(builder, points, 4);

    CM_STREAM_PROCESSOR stream;
    memset(&stream, 0, sizeof(stream));
    CHECK_CM_ERROR(cm_streamprocessorbuilder_build(builder, &stream));
    cm_streamprocessorbuilder_free(builder);

    printf("Please press 'q' then 'Enter' to stop stream processing.\n");

    CHECK_CM_ERROR(cm_streamprocessor_start(stream));

    while(getc(stdin) != 'q');

    CHECK_CM_ERROR(cm_streamprocessor_stop(stream));

    cm_streamprocessor_free(stream);
    cm_adaptive_recognition_cloud_free(ar_cloud);

    return 0;
}
