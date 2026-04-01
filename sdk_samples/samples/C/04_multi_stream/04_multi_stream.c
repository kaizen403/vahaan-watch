/**
 * CARMEN Video SDK
 *
 * @category    C Sample
 * @package     CARMEN Video C Sample
 *
 * @copyright   2024 Adaptive Recognition
 * @licence     https://adaptiverecognition.com/eula/
 *
 * This sample shows how you can set up a process with CARMEN Video SDK that
 * recognizes license plates (ANPR) and vehicle attributes (MMR) on multiple video streams.
 * There are "TODO" comments in the file where the code must be modified.
 */

#include <stdio.h>
#include <string.h>
#include <inttypes.h>

#include "utils.h"

#include <carmen/Event.h>
#include <carmen/AnprBuilder.h>
#include <carmen/MmrBuilder.h>
#include <carmen/StreamProcessorBuilder.h>
#include <carmen/CmError.h>

typedef struct StreamConfig {
    const char* url;
    const char* region;
    const char* name;
} StreamConfig;

//TODO: change them for valid streams and engines
#define NUM_STREAMPROCESSORS 2
StreamConfig streamConfigs[NUM_STREAMPROCESSORS] = {
        {"http://192.168.6.50:9901/video.mjpeg",         "eur", "Stream 1"},
        {"file:///C:\\Program Files\\videos\\video.mp4", "nam", "Stream 2"}
};


//TODO: EventCallback is called from a StreamProcessor instance's dedicated "EventCallback executor" thread.
// If you are using the same resource in multiple StreamProcessors' EventCallback
// you may have to protect against race conditions
void onEventCallback(CM_EVENT* e, void* userdata) {

    printf("------------------------------------------------------\n");
    printf("Channel name: %s\n", e->channelName);
    printf("Unix timestamp: %" PRId64 " ms\n", e->timestamp);

    CM_VEHICLE* vehicle = e->vehicle;
    CM_PLATE* plate = vehicle->plate;

    printf("Plate text: %s\n", plate->text);
    printf("Country: %s\n", plate->country);

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

int main(int argc, char** argv) {
    // INITIALIZE COMMON ANPR OBJECT
    CM_ANPR_BUILDER anprBuilder;
    memset(&anprBuilder, 0, sizeof(anprBuilder));
    cm_anprbuilder_create(&anprBuilder);
    cm_anprbuilder_set_type(anprBuilder, CM_ANPR_TYPE_LOCAL); // use CM_ANPR_TYPE_LOCAL_GO for CARMEN_GO engines
    cm_anprbuilder_set_local_concurrency_limit(anprBuilder,
                                               2); //TODO: change it to a value that matches the number of core licences you have

    CM_ANPR anpr;
    memset(&anpr, 0, sizeof(anpr));
    CHECK_CM_ERROR(cm_anprbuilder_build(anprBuilder, &anpr));
    cm_anprbuilder_free(anprBuilder);

    // INITIALIZE COMMON MMR (Make and Model Recognition) OBJECT
    CM_MMR_BUILDER mmrBuilder;
    memset(&mmrBuilder, 0, sizeof(mmrBuilder));
    cm_mmrbuilder_create(&mmrBuilder);
    cm_mmrbuilder_set_type(mmrBuilder, CM_MMR_TYPE_LOCAL);

    CM_MMR mmr;
    memset(&mmr, 0, sizeof(mmr));
    CHECK_CM_ERROR(cm_mmrbuilder_build(mmrBuilder, &mmr));
    cm_mmrbuilder_free(mmrBuilder);

    // BUILD STREAM PROCESSOR OBJECTS THAT USE THE COMMON ANPR AND MMR RESOURCES
    CM_STREAM_PROCESSOR streamProcessors[NUM_STREAMPROCESSORS];
    memset(streamProcessors, 0, sizeof(streamProcessors));

    for(int i = 0; i < NUM_STREAMPROCESSORS; ++i) {
        CM_STREAM_PROCESSOR_BUILDER builder;
        memset(&builder, 0, sizeof(builder));
        cm_streamprocessorbuilder_create(&builder);

        StreamConfig* curConfig = &streamConfigs[i];

        cm_streamprocessorbuilder_set_source(builder, curConfig->url);
        cm_streamprocessorbuilder_set_region(builder, curConfig->region);
        cm_streamprocessorbuilder_set_name(builder, curConfig->name);
        cm_streamprocessorbuilder_set_event_callback(builder, onEventCallback, NULL, NULL);
        cm_streamprocessorbuilder_set_status_change_callback(builder, onStatusChangeCallback, NULL, NULL);
        cm_streamprocessorbuilder_set_anpr(builder, anpr);
        cm_streamprocessorbuilder_set_mmr(builder, mmr);
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

        CHECK_CM_ERROR(cm_streamprocessorbuilder_build(builder, &streamProcessors[i]));
        cm_streamprocessorbuilder_free(builder);
    }

	printf("Please press 'q' then 'Enter' to stop stream processing.\n");

    // START STREAM PROCESSORS
    for(int i = 0; i < NUM_STREAMPROCESSORS; ++i) {
        CHECK_CM_ERROR(cm_streamprocessor_start(streamProcessors[i]));
    }

    // STREAM PROCESSORS ARE NOW RUNNING ASYNCHRONOUSLY

    // WAIT FOR KEY 'q' FROM STANDARD INPUT
    while(getc(stdin) != 'q');

    // STOP STREAM PROCESSORS
    for(int i = 0; i < NUM_STREAMPROCESSORS; ++i) {
        CM_STREAM_PROCESSOR* curStream = &streamProcessors[i];
        CHECK_CM_ERROR(cm_streamprocessor_stop(*curStream));
        cm_streamprocessor_free(*curStream);
    }

    // FREE COMMON ANPR AND MMR OBJECT
    cm_anpr_free(anpr);
    cm_mmr_free(mmr);

    return 0;
}
