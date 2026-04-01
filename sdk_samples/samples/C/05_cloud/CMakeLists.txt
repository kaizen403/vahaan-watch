project(c_sample_05_cloud)

add_executable(${PROJECT_NAME} 05_cloud.c)
target_link_libraries(${PROJECT_NAME} carmenVideoSDK_c)
